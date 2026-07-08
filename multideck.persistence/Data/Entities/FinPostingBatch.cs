using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPostingBatch
{
    public Guid FinpostBatchId { get; set; }

    public string? FinpostBatchNumber { get; set; }

    public string FinpostBatchStatusCode { get; set; } = null!;

    public string? FinpostBatchSourceTable { get; set; }

    public Guid? FinpostBatchSourceId { get; set; }

    public Guid? FinpostBatchPeriodId { get; set; }

    public Guid? FinpostBatchLegalEntityId { get; set; }

    public Guid? FinpostBatchOrgOfficeId { get; set; }

    public decimal FinpostBatchDebitTotal { get; set; }

    public decimal FinpostBatchCreditTotal { get; set; }

    public string FinpostBatchCurrencyCodeSnapshot { get; set; } = null!;

    public DateTime? FinpostBatchPostedAt { get; set; }

    public Guid? FinpostBatchPostedBy { get; set; }

    public DateTime FinpostBatchCreatedAt { get; set; }

    public Guid? FinpostBatchCreatedBy { get; set; }

    public virtual ICollection<FinIntegrationQueue> FinIntegrationQueues { get; set; } = new List<FinIntegrationQueue>();

    public virtual ICollection<FinPostingLine> FinPostingLines { get; set; } = new List<FinPostingLine>();

    public virtual CmpUser? FinpostBatchCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? FinpostBatchLegalEntity { get; set; }

    public virtual CmpOffice? FinpostBatchOrgOffice { get; set; }

    public virtual FinPeriod? FinpostBatchPeriod { get; set; }

    public virtual CmpUser? FinpostBatchPostedByNavigation { get; set; }

    public virtual SysFinancePostingStatus FinpostBatchStatusCodeNavigation { get; set; } = null!;
}
