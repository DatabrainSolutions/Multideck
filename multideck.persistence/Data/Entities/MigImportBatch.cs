using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigImportBatch
{
    public Guid MigbatchId { get; set; }

    public Guid? MigbatchProjectId { get; set; }

    public string MigbatchCode { get; set; } = null!;

    public string MigbatchName { get; set; } = null!;

    public string MigbatchEntityTypeCode { get; set; } = null!;

    public string MigbatchStatusCode { get; set; } = null!;

    public Guid? MigbatchOrgOfficeId { get; set; }

    public int MigbatchRowCount { get; set; }

    public int MigbatchValidRowCount { get; set; }

    public int MigbatchErrorRowCount { get; set; }

    public int MigbatchSourceFileCount { get; set; }

    public DateTime MigbatchCreatedAt { get; set; }

    public Guid? MigbatchCreatedBy { get; set; }

    public virtual ICollection<MigImportFile> MigImportFiles { get; set; } = new List<MigImportFile>();

    public virtual ICollection<MigImportRow> MigImportRows { get; set; } = new List<MigImportRow>();

    public virtual ICollection<MigImportRun> MigImportRuns { get; set; } = new List<MigImportRun>();

    public virtual ICollection<MigReconciliationSummary> MigReconciliationSummaries { get; set; } = new List<MigReconciliationSummary>();

    public virtual ICollection<MigRollbackPlan> MigRollbackPlans { get; set; } = new List<MigRollbackPlan>();

    public virtual ICollection<MigValidationIssue> MigValidationIssues { get; set; } = new List<MigValidationIssue>();

    public virtual CmpUser? MigbatchCreatedByNavigation { get; set; }

    public virtual SysMigentityType MigbatchEntityTypeCodeNavigation { get; set; } = null!;

    public virtual CmpOffice? MigbatchOrgOffice { get; set; }

    public virtual MigProject? MigbatchProject { get; set; }

    public virtual SysMigbatchStatus MigbatchStatusCodeNavigation { get; set; } = null!;
}
