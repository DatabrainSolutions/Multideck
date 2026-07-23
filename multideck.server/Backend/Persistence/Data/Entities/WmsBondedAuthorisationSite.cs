using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedAuthorisationSite
{
    public Guid WmsbondSiteId { get; set; }

    public Guid WmsbondSiteAuthorisationId { get; set; }

    public Guid WmsbondSiteFacilityId { get; set; }

    public Guid? WmsbondSiteZoneId { get; set; }

    public Guid? WmsbondSiteLocationId { get; set; }

    public string? WmsbondSiteSiteReference { get; set; }

    public bool WmsbondSiteIsDefault { get; set; }

    public bool WmsbondSiteIsActive { get; set; }

    public virtual WmsBondedAuthorisation WmsbondSiteAuthorisation { get; set; } = null!;

    public virtual WmsFacility WmsbondSiteFacility { get; set; } = null!;

    public virtual WmsLocation? WmsbondSiteLocation { get; set; }

    public virtual WmsZone? WmsbondSiteZone { get; set; }
}
