using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedRemoval
{
    public Guid WmsbondRemovalId { get; set; }

    public Guid WmsbondRemovalFacilityId { get; set; }

    public Guid? WmsbondRemovalOrderId { get; set; }

    public Guid? WmsbondRemovalJobId { get; set; }

    public string WmsbondRemovalRemovalNumber { get; set; } = null!;

    public string WmsbondRemovalRemovalTypeCode { get; set; } = null!;

    public string WmsbondRemovalStatusCode { get; set; } = null!;

    public string? WmsbondRemovalDeclarationReference { get; set; }

    public string? WmsbondRemovalCustomsReleaseReference { get; set; }

    public Guid? WmsbondRemovalDestinationOrgId { get; set; }

    public DateTime? WmsbondRemovalRemovalRequestedAt { get; set; }

    public DateTime? WmsbondRemovalRemovedAt { get; set; }

    public bool WmsbondRemovalRequiresFinanceRelease { get; set; }

    public bool WmsbondRemovalRequiresComplianceRelease { get; set; }

    public string? WmsbondRemovalNotes { get; set; }

    public DateTime WmsbondRemovalCreatedAt { get; set; }

    public Guid? WmsbondRemovalCreatedBy { get; set; }

    public virtual ICollection<WmsBondedRemovalLine> WmsBondedRemovalLines { get; set; } = new List<WmsBondedRemovalLine>();

    public virtual ICollection<WmsBondedTemporaryRemoval> WmsBondedTemporaryRemovals { get; set; } = new List<WmsBondedTemporaryRemoval>();

    public virtual CmpUser? WmsbondRemovalCreatedByNavigation { get; set; }

    public virtual OrgMaster? WmsbondRemovalDestinationOrg { get; set; }

    public virtual WmsFacility WmsbondRemovalFacility { get; set; } = null!;

    public virtual JobHeader? WmsbondRemovalJob { get; set; }

    public virtual WmsOrder? WmsbondRemovalOrder { get; set; }

    public virtual SysWmsbondedRemovalType WmsbondRemovalRemovalTypeCodeNavigation { get; set; } = null!;
}
