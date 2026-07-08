using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateContractVersion
{
    public Guid RatecontractVerId { get; set; }

    public Guid RatecontractVerContractId { get; set; }

    public int RatecontractVerVersionNo { get; set; }

    public string RatecontractVerStatusCode { get; set; } = null!;

    public DateOnly? RatecontractVerEffectiveFrom { get; set; }

    public DateOnly? RatecontractVerEffectiveTo { get; set; }

    public string RatecontractVerSourceTypeCode { get; set; } = null!;

    public string? RatecontractVerSourceReference { get; set; }

    public Guid? RatecontractVerImportedBatchId { get; set; }

    public string? RatecontractVerChangeReason { get; set; }

    public DateTime? RatecontractVerPublishedAt { get; set; }

    public Guid? RatecontractVerPublishedBy { get; set; }

    public string RatecontractVerSnapshotJson { get; set; } = null!;

    public DateTime RatecontractVerCreatedAt { get; set; }

    public Guid? RatecontractVerCreatedBy { get; set; }

    public DateTime RatecontractVerUpdatedAt { get; set; }

    public Guid? RatecontractVerUpdatedBy { get; set; }

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<RateContract> RateContracts { get; set; } = new List<RateContract>();

    public virtual ICollection<RateImportBatch> RateImportBatches { get; set; } = new List<RateImportBatch>();

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignments { get; set; } = new List<RateTariffAssignment>();

    public virtual RateContract RatecontractVerContract { get; set; } = null!;

    public virtual CmpUser? RatecontractVerCreatedByNavigation { get; set; }

    public virtual CmpUser? RatecontractVerPublishedByNavigation { get; set; }

    public virtual SysRateSourceType RatecontractVerSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysRateStatus RatecontractVerStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RatecontractVerUpdatedByNavigation { get; set; }
}
