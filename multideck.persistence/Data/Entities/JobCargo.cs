using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCargo
{
    public Guid JobCargoId { get; set; }

    public Guid? JobCargoJobId { get; set; }

    public string? JobCargoCommodity { get; set; }

    public decimal? JobCargoQty { get; set; }

    public decimal? JobCargoHeight { get; set; }

    public decimal? JobCargoWidth { get; set; }

    public decimal? JobCargoLength { get; set; }

    public decimal? JobCargoGrossKilos { get; set; }

    public decimal? JobCargoNettKilos { get; set; }

    public bool JobCargoPacked { get; set; }

    public virtual JobHeader? JobCargoJob { get; set; }

    public virtual ICollection<JobContainer> JobContainers { get; set; } = new List<JobContainer>();
}
