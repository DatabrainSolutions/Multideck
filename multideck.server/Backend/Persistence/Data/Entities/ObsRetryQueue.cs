using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsRetryQueue
{
    public Guid ObsretryId { get; set; }

    public string? ObsretryModuleCode { get; set; }

    public string ObsretrySourceTable { get; set; } = null!;

    public Guid ObsretrySourceId { get; set; }

    public string ObsretryStatusCode { get; set; } = null!;

    public int ObsretryAttemptCount { get; set; }

    public int ObsretryMaxAttempts { get; set; }

    public DateTime ObsretryNextAttemptAt { get; set; }

    public DateTime? ObsretryLastAttemptAt { get; set; }

    public string? ObsretryLastErrorMessage { get; set; }

    public string? ObsretryCorrelationId { get; set; }

    public string ObsretryPayloadJson { get; set; } = null!;

    public DateTime ObsretryCreatedAt { get; set; }

    public virtual SysSubmoduleCode? ObsretryModuleCodeNavigation { get; set; }

    public virtual SysObsqueueStatus ObsretryStatusCodeNavigation { get; set; } = null!;
}
