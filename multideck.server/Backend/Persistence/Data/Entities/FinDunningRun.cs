using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinDunningRun
{
    public Guid FindunRunId { get; set; }

    public string? FindunRunNumber { get; set; }

    public string FindunRunStatusCode { get; set; } = null!;

    public DateOnly FindunRunRunDate { get; set; }

    public Guid? FindunRunLegalEntityId { get; set; }

    public Guid? FindunRunOrgOfficeId { get; set; }

    public int FindunRunItemCount { get; set; }

    public decimal FindunRunTotalAmount { get; set; }

    public DateTime FindunRunCreatedAt { get; set; }

    public Guid? FindunRunCreatedBy { get; set; }

    public virtual ICollection<FinDunningItem> FinDunningItems { get; set; } = new List<FinDunningItem>();

    public virtual CmpUser? FindunRunCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? FindunRunLegalEntity { get; set; }

    public virtual CmpOffice? FindunRunOrgOffice { get; set; }
}
