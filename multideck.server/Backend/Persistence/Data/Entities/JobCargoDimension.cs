using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCargoDimension
{
    public Guid JobCargoDimId { get; set; }

    public Guid JobCargoDimJobCargoId { get; set; }

    public int JobCargoDimLineNo { get; set; }

    public decimal? JobCargoDimPieces { get; set; }

    public decimal? JobCargoDimLength { get; set; }

    public decimal? JobCargoDimWidth { get; set; }

    public decimal? JobCargoDimHeight { get; set; }

    public string JobCargoDimLengthUnit { get; set; } = null!;

    public decimal? JobCargoDimGrossKilos { get; set; }

    public decimal? JobCargoDimVolumeCbm { get; set; }

    public string? JobCargoDimDescription { get; set; }

    public DateTime JobCargoDimCreatedAt { get; set; }

    public virtual JobCargo JobCargoDimJobCargo { get; set; } = null!;
}
