using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigProject
{
    public Guid MigprojectId { get; set; }

    public string MigprojectCode { get; set; } = null!;

    public string MigprojectName { get; set; } = null!;

    public string? MigprojectSourceSystem { get; set; }

    public string MigprojectStatusCode { get; set; } = null!;

    public DateOnly? MigprojectTargetGoLiveDate { get; set; }

    public Guid? MigprojectOwnerUserId { get; set; }

    public string? MigprojectNotes { get; set; }

    public DateTime MigprojectCreatedAt { get; set; }

    public virtual ICollection<MigImportBatch> MigImportBatches { get; set; } = new List<MigImportBatch>();

    public virtual CmpUser? MigprojectOwnerUser { get; set; }

    public virtual SysMigbatchStatus MigprojectStatusCodeNavigation { get; set; } = null!;
}
