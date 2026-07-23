using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobRouteCargo
{
    public Guid JobRouteCargoId { get; set; }

    public Guid JobRouteCargoJobRouteId { get; set; }

    public Guid JobRouteCargoJobCargoId { get; set; }

    public decimal? JobRouteCargoPieces { get; set; }

    public decimal? JobRouteCargoGrossKilos { get; set; }

    public decimal? JobRouteCargoVolumeCbm { get; set; }

    public string? JobRouteCargoNotes { get; set; }

    public DateTime JobRouteCargoCreatedAt { get; set; }

    public virtual JobCargo JobRouteCargoJobCargo { get; set; } = null!;

    public virtual JobRouting JobRouteCargoJobRoute { get; set; } = null!;
}
