using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSubsubscriptionStatus
{
    public string SubstatusCode { get; set; } = null!;

    public string SubstatusName { get; set; } = null!;

    public string? SubstatusDescription { get; set; }

    public bool SubstatusIsActiveSubscription { get; set; }

    public bool SubstatusIsActive { get; set; }

    public int SubstatusSortOrder { get; set; }

    public virtual ICollection<SubModuleEntitlement> SubModuleEntitlements { get; set; } = new List<SubModuleEntitlement>();

    public virtual ICollection<SubSubscription> SubSubscriptions { get; set; } = new List<SubSubscription>();
}
