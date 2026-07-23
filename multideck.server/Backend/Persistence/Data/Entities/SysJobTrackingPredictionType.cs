using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobTrackingPredictionType
{
    public string JtptCode { get; set; } = null!;

    public string JtptName { get; set; } = null!;

    public string? JtptDescription { get; set; }

    public int JtptSortOrder { get; set; }

    public bool JtptIsActive { get; set; }

    public DateTime JtptCreatedAt { get; set; }

    public virtual ICollection<JobTrackingPrediction> JobTrackingPredictions { get; set; } = new List<JobTrackingPrediction>();
}
