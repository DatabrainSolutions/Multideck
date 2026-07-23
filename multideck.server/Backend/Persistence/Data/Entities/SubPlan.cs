using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubPlan
{
    public Guid SubplanId { get; set; }

    public string SubplanCode { get; set; } = null!;

    public string SubplanName { get; set; } = null!;

    public string? SubplanDescription { get; set; }

    public string? SubplanCurrencyCode { get; set; }

    public decimal? SubplanBasePriceAmount { get; set; }

    public bool SubplanIsPublic { get; set; }

    public bool SubplanIsActive { get; set; }

    public DateTime SubplanCreatedAt { get; set; }

    public virtual ICollection<SubPlanModule> SubPlanModules { get; set; } = new List<SubPlanModule>();

    public virtual ICollection<SubSubscription> SubSubscriptions { get; set; } = new List<SubSubscription>();
}
