using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceChecklistSummary
{
    public Guid? TcechecklistId { get; set; }

    public string? TcechecklistNumber { get; set; }

    public string? TcechecklistStatusCode { get; set; }

    public string? TcecheckStatusName { get; set; }

    public bool? TcecheckStatusIsOpen { get; set; }

    public bool? TcecheckStatusIsBlocking { get; set; }

    public string? TcechecklistTouchpointTypeCode { get; set; }

    public Guid? TcechecklistPolicyId { get; set; }

    public Guid? TcechecklistJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? TcechecklistCustomerOrgId { get; set; }

    public string? TcechecklistCustomerName { get; set; }

    public Guid? TcechecklistOrgOfficeId { get; set; }

    public string? TcechecklistSourceTable { get; set; }

    public Guid? TcechecklistSourceId { get; set; }

    public DateTime? TcechecklistRequiredBy { get; set; }

    public DateTime? TcechecklistCompletedAt { get; set; }

    public int? TcechecklistItemRows { get; set; }

    public int? TcechecklistOpenItemRows { get; set; }

    public int? TcechecklistBlockedItemRows { get; set; }

    public int? TcechecklistBlockingGateRows { get; set; }

    public DateTime? TcechecklistCreatedAt { get; set; }
}
