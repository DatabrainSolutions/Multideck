using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobContainer
{
    public Guid JobContainersId { get; set; }

    public Guid? JobId { get; set; }

    public Guid? JobContainerType { get; set; }

    public string? JobContainerNumber { get; set; }

    public decimal? JobContainerHeight { get; set; }

    public decimal? JobContainerWidth { get; set; }

    public decimal? JobContainerLength { get; set; }

    public virtual JobHeader? Job { get; set; }

    public virtual ICollection<JobCargo> JobCargos { get; set; } = new List<JobCargo>();
}
