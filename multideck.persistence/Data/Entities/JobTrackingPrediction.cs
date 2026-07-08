using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobTrackingPrediction
{
    public Guid JobTrackPredId { get; set; }

    public Guid JobTrackPredJobId { get; set; }

    public Guid? JobTrackPredJobRouteId { get; set; }

    public Guid? JobTrackPredJobCargoId { get; set; }

    public Guid? JobTrackPredJobContainerId { get; set; }

    public string JobTrackPredType { get; set; } = null!;

    public DateTime? JobTrackPredPredictedAt { get; set; }

    public string? JobTrackPredPredictedLocationUnlocode { get; set; }

    public string? JobTrackPredPredictedLocationNameSnapshot { get; set; }

    public string? JobTrackPredPredictedStatus { get; set; }

    public decimal? JobTrackPredRiskScore { get; set; }

    public decimal? JobTrackPredConfidenceScore { get; set; }

    public string? JobTrackPredModelName { get; set; }

    public string? JobTrackPredModelVersion { get; set; }

    public DateTime? JobTrackPredInputCutoffAt { get; set; }

    public string JobTrackPredFeaturesJson { get; set; } = null!;

    public string JobTrackPredExplanationJson { get; set; } = null!;

    public bool JobTrackPredIsActive { get; set; }

    public Guid? JobTrackPredSupersededById { get; set; }

    public DateTime JobTrackPredCreatedAt { get; set; }

    public Guid? JobTrackPredCreatedBy { get; set; }

    public virtual ICollection<JobTrackingPrediction> InverseJobTrackPredSupersededBy { get; set; } = new List<JobTrackingPrediction>();

    public virtual ICollection<JobKpiresult> JobKpiresults { get; set; } = new List<JobKpiresult>();

    public virtual JobHeader JobTrackPredJob { get; set; } = null!;

    public virtual JobCargo? JobTrackPredJobCargo { get; set; }

    public virtual JobContainer? JobTrackPredJobContainer { get; set; }

    public virtual JobRouting? JobTrackPredJobRoute { get; set; }

    public virtual JobTrackingPrediction? JobTrackPredSupersededBy { get; set; }

    public virtual SysJobTrackingPredictionType JobTrackPredTypeNavigation { get; set; } = null!;
}
