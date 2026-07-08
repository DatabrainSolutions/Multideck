using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsOpenExceptionQueue
{
    public Guid? ExceptionId { get; set; }

    public string? ModuleCode { get; set; }

    public string? SourceTable { get; set; }

    public Guid? SourceId { get; set; }

    public string? SeverityCode { get; set; }

    public string? StatusCode { get; set; }

    public string? Title { get; set; }

    public string? Message { get; set; }

    public Guid? AssignedToUserId { get; set; }

    public DateTime? DueAt { get; set; }

    public DateTime? CreatedAt { get; set; }

    public decimal? AgeHours { get; set; }
}
