using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubClientEnvironment
{
    public Guid SubenvId { get; set; }

    public string SubenvCode { get; set; } = null!;

    public string SubenvName { get; set; } = null!;

    public string SubenvTypeCode { get; set; } = null!;

    public string? SubenvRegionCode { get; set; }

    public string? SubenvPrimaryLocaleCode { get; set; }

    public string? SubenvPrimaryTimeZoneCode { get; set; }

    public string? SubenvDatabaseRef { get; set; }

    public bool SubenvIsProduction { get; set; }

    public bool SubenvIsActive { get; set; }

    public DateTime SubenvCreatedAt { get; set; }

    public virtual ICollection<SubSubscription> SubSubscriptions { get; set; } = new List<SubSubscription>();

    public virtual SysSubenvironmentType SubenvTypeCodeNavigation { get; set; } = null!;
}
