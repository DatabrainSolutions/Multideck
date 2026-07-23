using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMigbatchStatus
{
    public string MigbatchStatusCode { get; set; } = null!;

    public string MigbatchStatusName { get; set; } = null!;

    public string? MigbatchStatusDescription { get; set; }

    public bool MigbatchStatusIsTerminal { get; set; }

    public bool MigbatchStatusIsSuccess { get; set; }

    public bool MigbatchStatusIsActive { get; set; }

    public int MigbatchStatusSortOrder { get; set; }

    public virtual ICollection<MigImportBatch> MigImportBatches { get; set; } = new List<MigImportBatch>();

    public virtual ICollection<MigProject> MigProjects { get; set; } = new List<MigProject>();

    public virtual ICollection<MigRollbackPlan> MigRollbackPlans { get; set; } = new List<MigRollbackPlan>();
}
