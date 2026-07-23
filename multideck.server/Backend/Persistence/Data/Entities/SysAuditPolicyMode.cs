using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAuditPolicyMode
{
    public string AuditPolicyModeCode { get; set; } = null!;

    public string AuditPolicyModeName { get; set; } = null!;

    public string? AuditPolicyModeDescription { get; set; }

    public bool AuditPolicyModeIsActive { get; set; }

    public int AuditPolicyModeSortOrder { get; set; }

    public virtual ICollection<AuditTablePolicy> AuditTablePolicies { get; set; } = new List<AuditTablePolicy>();
}
