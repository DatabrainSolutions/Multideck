using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedEquivalenceRule
{
    public Guid WmsbondEquivId { get; set; }

    public Guid WmsbondEquivAuthorisationId { get; set; }

    public Guid? WmsbondEquivItemId { get; set; }

    public string? WmsbondEquivHscode { get; set; }

    public string? WmsbondEquivOriginCountryCode { get; set; }

    public string WmsbondEquivAllowedMethodCode { get; set; } = null!;

    public string WmsbondEquivRestrictionJson { get; set; } = null!;

    public bool WmsbondEquivIsActive { get; set; }

    public virtual WmsBondedAuthorisation WmsbondEquivAuthorisation { get; set; } = null!;

    public virtual WmsItem? WmsbondEquivItem { get; set; }
}
