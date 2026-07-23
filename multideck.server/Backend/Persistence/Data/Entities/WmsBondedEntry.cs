using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedEntry
{
    public Guid WmsbondEntryId { get; set; }

    public Guid WmsbondEntryAuthorisationId { get; set; }

    public Guid WmsbondEntryFacilityId { get; set; }

    public Guid? WmsbondEntryOrderId { get; set; }

    public Guid? WmsbondEntryJobId { get; set; }

    public Guid? WmsbondEntryDepositorOrgId { get; set; }

    public Guid? WmsbondEntryImporterOrgId { get; set; }

    public string WmsbondEntryEntryReference { get; set; } = null!;

    public string? WmsbondEntryDeclarationReference { get; set; }

    public string WmsbondEntryProcedureTypeCode { get; set; } = null!;

    public string WmsbondEntryCustomsStatusCode { get; set; } = null!;

    public DateOnly WmsbondEntryAdmissionDate { get; set; }

    public string WmsbondEntryStatusCode { get; set; } = null!;

    public Guid? WmsbondEntryGuaranteeId { get; set; }

    public decimal WmsbondEntryTotalCustomsValue { get; set; }

    public decimal WmsbondEntryTotalDutyEstimate { get; set; }

    public decimal WmsbondEntryTotalTaxEstimate { get; set; }

    public string WmsbondEntryCurrencyCode { get; set; } = null!;

    public string WmsbondEntryMetadataJson { get; set; } = null!;

    public DateTime WmsbondEntryCreatedAt { get; set; }

    public Guid? WmsbondEntryCreatedBy { get; set; }

    public virtual ICollection<WmsBondedDiscrepancy> WmsBondedDiscrepancies { get; set; } = new List<WmsBondedDiscrepancy>();

    public virtual ICollection<WmsBondedEntryLine> WmsBondedEntryLines { get; set; } = new List<WmsBondedEntryLine>();

    public virtual ICollection<WmsBondedInventoryLink> WmsBondedInventoryLinks { get; set; } = new List<WmsBondedInventoryLink>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovements { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsBondedTemporaryRemoval> WmsBondedTemporaryRemovals { get; set; } = new List<WmsBondedTemporaryRemoval>();

    public virtual WmsBondedAuthorisation WmsbondEntryAuthorisation { get; set; } = null!;

    public virtual CmpUser? WmsbondEntryCreatedByNavigation { get; set; }

    public virtual SysWmscustomsStatus WmsbondEntryCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? WmsbondEntryDepositorOrg { get; set; }

    public virtual WmsFacility WmsbondEntryFacility { get; set; } = null!;

    public virtual WmsBondedGuarantee? WmsbondEntryGuarantee { get; set; }

    public virtual OrgMaster? WmsbondEntryImporterOrg { get; set; }

    public virtual JobHeader? WmsbondEntryJob { get; set; }

    public virtual WmsOrder? WmsbondEntryOrder { get; set; }

    public virtual SysWmsbondedProcedureType WmsbondEntryProcedureTypeCodeNavigation { get; set; } = null!;
}
