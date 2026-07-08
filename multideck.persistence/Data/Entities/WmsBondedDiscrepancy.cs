using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedDiscrepancy
{
    public Guid WmsbondDiscId { get; set; }

    public Guid WmsbondDiscFacilityId { get; set; }

    public Guid? WmsbondDiscEntryId { get; set; }

    public Guid? WmsbondDiscEntryLineId { get; set; }

    public Guid? WmsbondDiscBalanceId { get; set; }

    public string WmsbondDiscDiscrepancyTypeCode { get; set; } = null!;

    public string WmsbondDiscStatusCode { get; set; } = null!;

    public decimal? WmsbondDiscExpectedQuantity { get; set; }

    public decimal? WmsbondDiscActualQuantity { get; set; }

    public string? WmsbondDiscCustomsNotificationReference { get; set; }

    public string WmsbondDiscDescription { get; set; } = null!;

    public Guid? WmsbondDiscWorkflowTaskId { get; set; }

    public DateTime WmsbondDiscCreatedAt { get; set; }

    public Guid? WmsbondDiscCreatedBy { get; set; }

    public virtual WmsInventoryBalance? WmsbondDiscBalance { get; set; }

    public virtual CmpUser? WmsbondDiscCreatedByNavigation { get; set; }

    public virtual SysWmsbondedDiscrepancyType WmsbondDiscDiscrepancyTypeCodeNavigation { get; set; } = null!;

    public virtual WmsBondedEntry? WmsbondDiscEntry { get; set; }

    public virtual WmsBondedEntryLine? WmsbondDiscEntryLine { get; set; }

    public virtual WmsFacility WmsbondDiscFacility { get; set; } = null!;

    public virtual WorkflowTask? WmsbondDiscWorkflowTask { get; set; }
}
