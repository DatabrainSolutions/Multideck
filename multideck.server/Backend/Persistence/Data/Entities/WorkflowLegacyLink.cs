using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowLegacyLink
{
    public Guid WorkflowLegacyId { get; set; }

    public string WorkflowLegacySourceTable { get; set; } = null!;

    public Guid WorkflowLegacySourceId { get; set; }

    public Guid? WorkflowLegacyDefinitionId { get; set; }

    public Guid? WorkflowLegacyDefinitionVersionId { get; set; }

    public Guid? WorkflowLegacyInstanceId { get; set; }

    public Guid? WorkflowLegacyTaskId { get; set; }

    public string WorkflowLegacyMigrationStatus { get; set; } = null!;

    public string? WorkflowLegacyMigrationNotes { get; set; }

    public DateTime WorkflowLegacyCreatedAt { get; set; }

    public Guid? WorkflowLegacyCreatedBy { get; set; }

    public virtual CmpUser? WorkflowLegacyCreatedByNavigation { get; set; }

    public virtual WorkflowDefinition? WorkflowLegacyDefinition { get; set; }

    public virtual WorkflowDefinitionVersion? WorkflowLegacyDefinitionVersion { get; set; }

    public virtual WorkflowInstance? WorkflowLegacyInstance { get; set; }

    public virtual WorkflowTask? WorkflowLegacyTask { get; set; }
}
