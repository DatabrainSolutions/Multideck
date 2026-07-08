using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobContainerSeal
{
    public Guid JobContainerSealId { get; set; }

    public Guid JobContainerSealJobContainerId { get; set; }

    public string JobContainerSealNumber { get; set; } = null!;

    public string? JobContainerSealType { get; set; }

    public Guid? JobContainerSealAppliedByOrgId { get; set; }

    public DateTime? JobContainerSealAppliedAt { get; set; }

    public DateTime? JobContainerSealRemovedAt { get; set; }

    public DateTime JobContainerSealCreatedAt { get; set; }

    public virtual JobContainer JobContainerSealJobContainer { get; set; } = null!;
}
