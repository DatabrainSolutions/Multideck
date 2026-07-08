using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedReconciliation
{
    public Guid WmsbondReconId { get; set; }

    public Guid WmsbondReconFacilityId { get; set; }

    public Guid? WmsbondReconAuthorisationId { get; set; }

    public DateOnly WmsbondReconPeriodStartDate { get; set; }

    public DateOnly WmsbondReconPeriodEndDate { get; set; }

    public string WmsbondReconStatusCode { get; set; } = null!;

    public decimal WmsbondReconSystemQuantity { get; set; }

    public decimal WmsbondReconCountedQuantity { get; set; }

    public decimal WmsbondReconDiscrepancyQuantity { get; set; }

    public int WmsbondReconDiscrepancyCount { get; set; }

    public Guid? WmsbondReconReportDocumentId { get; set; }

    public DateTime? WmsbondReconSubmittedAt { get; set; }

    public DateTime? WmsbondReconApprovedAt { get; set; }

    public DateTime WmsbondReconCreatedAt { get; set; }

    public Guid? WmsbondReconCreatedBy { get; set; }

    public virtual WmsBondedAuthorisation? WmsbondReconAuthorisation { get; set; }

    public virtual CmpUser? WmsbondReconCreatedByNavigation { get; set; }

    public virtual WmsFacility WmsbondReconFacility { get; set; } = null!;
}
