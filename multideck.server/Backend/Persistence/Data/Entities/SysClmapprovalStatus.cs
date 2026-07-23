using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmapprovalStatus
{
    public string ClmapprovalStatusCode { get; set; } = null!;

    public string ClmapprovalStatusName { get; set; } = null!;

    public string? ClmapprovalStatusDescription { get; set; }

    public bool ClmapprovalStatusIsOpen { get; set; }

    public bool ClmapprovalStatusIsFinal { get; set; }

    public bool ClmapprovalStatusIsActive { get; set; }

    public int ClmapprovalStatusSortOrder { get; set; }

    public virtual ICollection<ClmClaimApproval> ClmClaimApprovals { get; set; } = new List<ClmClaimApproval>();

    public virtual ICollection<ClmPolicyRenewal> ClmPolicyRenewals { get; set; } = new List<ClmPolicyRenewal>();
}
