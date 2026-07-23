using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsRetryQueueDue
{
    public Guid? RetryId { get; set; }

    public string? ModuleCode { get; set; }

    public string? SourceTable { get; set; }

    public Guid? SourceId { get; set; }

    public string? StatusCode { get; set; }

    public int? AttemptCount { get; set; }

    public int? MaxAttempts { get; set; }

    public DateTime? NextAttemptAt { get; set; }

    public string? LastErrorMessage { get; set; }

    public string? CorrelationId { get; set; }
}
