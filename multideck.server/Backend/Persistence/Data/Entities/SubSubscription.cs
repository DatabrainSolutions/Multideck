using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubSubscription
{
    public Guid SubsubscriptionId { get; set; }

    public Guid? SubsubscriptionEnvironmentId { get; set; }

    public Guid? SubsubscriptionPlanId { get; set; }

    public string SubsubscriptionStatusCode { get; set; } = null!;

    public DateOnly SubsubscriptionStartDate { get; set; }

    public DateOnly? SubsubscriptionEndDate { get; set; }

    public DateOnly? SubsubscriptionRenewalDate { get; set; }

    public string? SubsubscriptionBillingAccountRef { get; set; }

    public string? SubsubscriptionNotes { get; set; }

    public DateTime SubsubscriptionCreatedAt { get; set; }

    public virtual ICollection<SubModuleEntitlement> SubModuleEntitlements { get; set; } = new List<SubModuleEntitlement>();

    public virtual SubClientEnvironment? SubsubscriptionEnvironment { get; set; }

    public virtual SubPlan? SubsubscriptionPlan { get; set; }

    public virtual SysSubsubscriptionStatus SubsubscriptionStatusCodeNavigation { get; set; } = null!;
}
