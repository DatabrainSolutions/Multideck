using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobRouteContainer
{
    public Guid JobRouteContainerId { get; set; }

    public Guid JobRouteContainerJobRouteId { get; set; }

    public Guid JobRouteContainerJobContainerId { get; set; }

    public DateTime? JobRouteContainerLoadedAt { get; set; }

    public DateTime? JobRouteContainerDischargedAt { get; set; }

    public string? JobRouteContainerNotes { get; set; }

    public DateTime JobRouteContainerCreatedAt { get; set; }

    public virtual JobContainer JobRouteContainerJobContainer { get; set; } = null!;

    public virtual JobRouting JobRouteContainerJobRoute { get; set; } = null!;
}
