using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmrecoveryStatus
{
    public string ClmrecoveryStatusCode { get; set; } = null!;

    public string ClmrecoveryStatusName { get; set; } = null!;

    public string? ClmrecoveryStatusDescription { get; set; }

    public bool ClmrecoveryStatusIsOpen { get; set; }

    public bool ClmrecoveryStatusIsFinal { get; set; }

    public bool ClmrecoveryStatusIsActive { get; set; }

    public int ClmrecoveryStatusSortOrder { get; set; }

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveries { get; set; } = new List<ClmClaimRecovery>();
}
