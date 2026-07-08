using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceOperationalReleaseQueue
{
    public Guid? TcegateId { get; set; }

    public string? TcegateStatusCode { get; set; }

    public string? TcecheckStatusName { get; set; }

    public bool? TcecheckStatusIsOpen { get; set; }

    public bool? TcecheckStatusIsBlocking { get; set; }

    public string? TcegateGateCode { get; set; }

    public string? TcegateName { get; set; }

    public string? TcegateActionCode { get; set; }

    public bool? TcegateIsBlocking { get; set; }

    public Guid? TcegateJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? TcechecklistId { get; set; }

    public string? TcechecklistNumber { get; set; }

    public string? TcechecklistTouchpointTypeCode { get; set; }

    public Guid? TcechecklistCustomerOrgId { get; set; }

    public string? TcegateCustomerName { get; set; }

    public string? TcegateSourceTable { get; set; }

    public Guid? TcegateSourceId { get; set; }

    public Guid? TcegateHoldId { get; set; }

    public string? TceholdReason { get; set; }

    public string? TcegateBlockReason { get; set; }

    public DateTime? TcegateRequiredClearanceAt { get; set; }

    public DateTime? TcegateClearedAt { get; set; }

    public int? TcegateBlockedItemCount { get; set; }

    public int? TcegateOpenItemCount { get; set; }

    public DateTime? TcegateCreatedAt { get; set; }
}
