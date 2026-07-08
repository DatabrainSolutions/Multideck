using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubModuleEntitlement
{
    public Guid SubentitlementId { get; set; }

    public Guid? SubentitlementSubscriptionId { get; set; }

    public string SubentitlementModuleCode { get; set; } = null!;

    public string SubentitlementStatusCode { get; set; } = null!;

    public bool SubentitlementIsEnabled { get; set; }

    public int? SubentitlementUserLimit { get; set; }

    public int? SubentitlementRecordLimit { get; set; }

    public string SubentitlementUsageLimitJson { get; set; } = null!;

    public DateOnly SubentitlementEffectiveFrom { get; set; }

    public DateOnly? SubentitlementEffectiveTo { get; set; }

    public virtual SysSubmoduleCode SubentitlementModuleCodeNavigation { get; set; } = null!;

    public virtual SysSubsubscriptionStatus SubentitlementStatusCodeNavigation { get; set; } = null!;

    public virtual SubSubscription? SubentitlementSubscription { get; set; }
}
