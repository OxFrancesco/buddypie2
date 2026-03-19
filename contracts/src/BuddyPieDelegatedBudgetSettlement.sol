// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Minimal {
  function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract BuddyPieDelegatedBudgetSettlement {
  enum BudgetType {
    Fixed,
    Periodic
  }

  enum PeriodInterval {
    None,
    Day,
    Week,
    Month
  }

  struct Budget {
    address owner;
    address delegate;
    address delegatorSmartAccount;
    address token;
    uint256 configuredAmount;
    uint256 remainingAmount;
    uint64 periodStartAt;
    uint64 periodEndsAt;
    uint64 lastSettlementAt;
    uint64 lastRevokedAt;
    BudgetType budgetType;
    PeriodInterval interval;
    bool active;
    bool revoked;
  }

  error BudgetAlreadyExists();
  error BudgetNotFound();
  error InvalidBudgetConfig();
  error InvalidAmount();
  error NotBudgetOwner();
  error NotAuthorizedSettler();
  error BudgetInactive();
  error BudgetIsRevoked();
  error SettlementAlreadyUsed();
  error TransferFailed();

  event BudgetCreated(
    bytes32 indexed budgetId,
    address indexed owner,
    address indexed delegate,
    address delegatorSmartAccount,
    address token,
    BudgetType budgetType,
    PeriodInterval interval,
    uint256 configuredAmount,
    uint64 periodStartAt,
    uint64 periodEndsAt
  );

  event BudgetSettled(
    bytes32 indexed budgetId,
    bytes32 indexed settlementId,
    address indexed delegate,
    address owner,
    address treasury,
    uint256 amount,
    uint256 remainingAmount,
    uint64 settledAt
  );

  event BudgetPeriodReset(
    bytes32 indexed budgetId,
    uint64 previousPeriodStartAt,
    uint64 previousPeriodEndsAt,
    uint64 newPeriodStartAt,
    uint64 newPeriodEndsAt,
    uint256 resetAmount
  );

  event BudgetRevoked(
    bytes32 indexed budgetId,
    address indexed owner,
    uint64 revokedAt
  );

  address public immutable treasury;
  address public immutable usdcToken;

  mapping(bytes32 => Budget) private budgets;
  mapping(bytes32 => mapping(bytes32 => bool)) private usedSettlementIds;

  constructor(address treasury_, address usdcToken_) {
    if (treasury_ == address(0) || usdcToken_ == address(0)) {
      revert InvalidBudgetConfig();
    }

    treasury = treasury_;
    usdcToken = usdcToken_;
  }

  function createBudget(
    bytes32 budgetId,
    address delegatorSmartAccount,
    address delegate,
    BudgetType budgetType,
    PeriodInterval interval,
    uint256 configuredAmount
  ) external {
    if (
      budgetId == bytes32(0) ||
      delegatorSmartAccount == address(0) ||
      delegate == address(0) ||
      configuredAmount == 0
    ) {
      revert InvalidBudgetConfig();
    }

    if (budgets[budgetId].owner != address(0)) {
      revert BudgetAlreadyExists();
    }

    if (budgetType == BudgetType.Fixed) {
      if (interval != PeriodInterval.None) {
        revert InvalidBudgetConfig();
      }
    } else {
      if (interval == PeriodInterval.None) {
        revert InvalidBudgetConfig();
      }
    }

    uint64 periodStartAt = uint64(block.timestamp);
    uint64 periodEndsAt = 0;

    if (budgetType == BudgetType.Periodic) {
      periodEndsAt = _advancePeriodEnd(periodStartAt, interval);
    }

    budgets[budgetId] = Budget({
      owner: msg.sender,
      delegate: delegate,
      delegatorSmartAccount: delegatorSmartAccount,
      token: usdcToken,
      configuredAmount: configuredAmount,
      remainingAmount: configuredAmount,
      periodStartAt: periodStartAt,
      periodEndsAt: periodEndsAt,
      lastSettlementAt: 0,
      lastRevokedAt: 0,
      budgetType: budgetType,
      interval: interval,
      active: true,
      revoked: false
    });

    emit BudgetCreated(
      budgetId,
      msg.sender,
      delegate,
      delegatorSmartAccount,
      usdcToken,
      budgetType,
      interval,
      configuredAmount,
      periodStartAt,
      periodEndsAt
    );
  }

  function revokeBudget(bytes32 budgetId) external {
    Budget storage budget = budgets[budgetId];
    if (budget.owner == address(0)) {
      revert BudgetNotFound();
    }

    if (msg.sender != budget.owner) {
      revert NotBudgetOwner();
    }

    budget.active = false;
    budget.revoked = true;
    budget.lastRevokedAt = uint64(block.timestamp);

    emit BudgetRevoked(budgetId, budget.owner, budget.lastRevokedAt);
  }

  function settleBudget(
    bytes32 budgetId,
    bytes32 settlementId,
    uint256 amount
  ) external returns (uint256 remainingAmount) {
    if (amount == 0) {
      revert InvalidAmount();
    }

    Budget storage budget = budgets[budgetId];
    if (budget.owner == address(0)) {
      revert BudgetNotFound();
    }

    if (!budget.active) {
      if (budget.revoked) {
        revert BudgetIsRevoked();
      }

      revert BudgetInactive();
    }

    if (
      msg.sender != budget.delegate &&
      msg.sender != budget.delegatorSmartAccount
    ) {
      revert NotAuthorizedSettler();
    }

    if (usedSettlementIds[budgetId][settlementId]) {
      revert SettlementAlreadyUsed();
    }

    if (budget.budgetType == BudgetType.Periodic) {
      _refreshPeriodicBudget(budgetId, budget);
    }

    if (budget.remainingAmount < amount) {
      revert InvalidAmount();
    }

    usedSettlementIds[budgetId][settlementId] = true;
    budget.remainingAmount -= amount;
    budget.lastSettlementAt = uint64(block.timestamp);

    bool transferred = IERC20Minimal(budget.token).transferFrom(
      budget.owner,
      treasury,
      amount
    );
    if (!transferred) {
      revert TransferFailed();
    }

    emit BudgetSettled(
      budgetId,
      settlementId,
      msg.sender,
      budget.owner,
      treasury,
      amount,
      budget.remainingAmount,
      budget.lastSettlementAt
    );

    return budget.remainingAmount;
  }

  function getBudget(bytes32 budgetId) external view returns (Budget memory) {
    Budget memory budget = budgets[budgetId];
    if (budget.owner == address(0)) {
      revert BudgetNotFound();
    }

    return budget;
  }

  function isSettlementUsed(
    bytes32 budgetId,
    bytes32 settlementId
  ) external view returns (bool) {
    return usedSettlementIds[budgetId][settlementId];
  }

  function _refreshPeriodicBudget(bytes32 budgetId, Budget storage budget) internal {
    if (budget.budgetType != BudgetType.Periodic) {
      return;
    }

    if (block.timestamp < budget.periodEndsAt) {
      return;
    }

    uint64 previousPeriodStartAt = budget.periodStartAt;
    uint64 previousPeriodEndsAt = budget.periodEndsAt;
    uint64 nextPeriodStartAt = previousPeriodStartAt;
    uint64 nextPeriodEndsAt = previousPeriodEndsAt;

    while (block.timestamp >= nextPeriodEndsAt) {
      nextPeriodStartAt = nextPeriodEndsAt;
      nextPeriodEndsAt = _advancePeriodEnd(nextPeriodStartAt, budget.interval);
    }

    budget.periodStartAt = nextPeriodStartAt;
    budget.periodEndsAt = nextPeriodEndsAt;
    budget.remainingAmount = budget.configuredAmount;

    emit BudgetPeriodReset(
      budgetId,
      previousPeriodStartAt,
      previousPeriodEndsAt,
      nextPeriodStartAt,
      nextPeriodEndsAt,
      budget.configuredAmount
    );
  }

  function _advancePeriodEnd(
    uint64 timestamp,
    PeriodInterval interval
  ) internal pure returns (uint64) {
    if (interval == PeriodInterval.Day) {
      return timestamp + 1 days;
    }

    if (interval == PeriodInterval.Week) {
      return timestamp + 7 days;
    }

    if (interval == PeriodInterval.Month) {
      return uint64(_addMonths(timestamp, 1));
    }

    revert InvalidBudgetConfig();
  }

  function _addMonths(uint256 timestamp, uint256 monthsToAdd) internal pure returns (uint256) {
    (
      uint256 year,
      uint256 month,
      uint256 day,
      uint256 hour,
      uint256 minute,
      uint256 second
    ) = _timestampToDateTime(timestamp);

    month += monthsToAdd;
    year += (month - 1) / 12;
    month = ((month - 1) % 12) + 1;

    uint256 daysInMonth = _daysInMonth(year, month);
    if (day > daysInMonth) {
      day = daysInMonth;
    }

    return _dateTimeToTimestamp(year, month, day, hour, minute, second);
  }

  function _timestampToDateTime(
    uint256 timestamp
  )
    internal
    pure
    returns (uint256 year, uint256 month, uint256 day, uint256 hour, uint256 minute, uint256 second)
  {
    uint256 dayCount = timestamp / 1 days;
    uint256 secondsInDay = timestamp % 1 days;

    (year, month, day) = _daysToDate(dayCount);
    hour = secondsInDay / 3600;
    minute = (secondsInDay % 3600) / 60;
    second = secondsInDay % 60;
  }

  function _dateTimeToTimestamp(
    uint256 year,
    uint256 month,
    uint256 day,
    uint256 hour,
    uint256 minute,
    uint256 second
  ) internal pure returns (uint256 timestamp) {
    timestamp =
      _daysFromDate(year, month, day) *
      1 days +
      hour *
      3600 +
      minute *
      60 +
      second;
  }

  function _daysInMonth(uint256 year, uint256 month) internal pure returns (uint256) {
    if (
      month == 1 ||
      month == 3 ||
      month == 5 ||
      month == 7 ||
      month == 8 ||
      month == 10 ||
      month == 12
    ) {
      return 31;
    }

    if (month == 4 || month == 6 || month == 9 || month == 11) {
      return 30;
    }

    if (_isLeapYear(year)) {
      return 29;
    }

    return 28;
  }

  function _isLeapYear(uint256 year) internal pure returns (bool) {
    return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
  }

  function _daysFromDate(
    uint256 year,
    uint256 month,
    uint256 day
  ) internal pure returns (uint256 _days) {
    int256 _year = int256(uint256(year));
    int256 _month = int256(uint256(month));
    int256 _day = int256(uint256(day));

    int256 daysInt =
      _day -
      32075 +
      (1461 * (_year + 4800 + ((_month - 14) / 12))) /
      4 +
      (367 * (_month - 2 - (((_month - 14) / 12) * 12))) /
      12 -
      (3 * (((_year + 4900 + ((_month - 14) / 12)) / 100))) /
      4 -
      2440588;

    _days = uint256(daysInt);
  }

  function _daysToDate(
    uint256 _days
  ) internal pure returns (uint256 year, uint256 month, uint256 day) {
    int256 daysInt = int256(uint256(_days));
    int256 l = daysInt + 68569 + 2440588;
    int256 n = (4 * l) / 146097;
    l = l - (146097 * n + 3) / 4;
    int256 yearInt = (4000 * (l + 1)) / 1461001;
    l = l - (1461 * yearInt) / 4 + 31;
    int256 monthInt = (80 * l) / 2447;
    int256 dayInt = l - (2447 * monthInt) / 80;
    l = monthInt / 11;
    monthInt = monthInt + 2 - 12 * l;
    yearInt = 100 * (n - 49) + yearInt + l;

    year = uint256(yearInt);
    month = uint256(monthInt);
    day = uint256(dayInt);
  }
}
