using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MigRollbackPlan
{
    public Guid MigrollbackId { get; set; }

    public Guid MigrollbackBatchId { get; set; }

    public string MigrollbackPlanJson { get; set; } = null!;

    public string MigrollbackStatusCode { get; set; } = null!;

    public Guid? MigrollbackApprovedBy { get; set; }

    public DateTime? MigrollbackApprovedAt { get; set; }

    public DateTime MigrollbackCreatedAt { get; set; }

    public virtual CmpUser? MigrollbackApprovedByNavigation { get; set; }

    public virtual MigImportBatch MigrollbackBatch { get; set; } = null!;

    public virtual SysMigbatchStatus MigrollbackStatusCodeNavigation { get; set; } = null!;
}
