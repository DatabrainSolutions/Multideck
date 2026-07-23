using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommCallLogSummary
{
    public Guid? CommCallId { get; set; }

    public Guid? CommCallThreadId { get; set; }

    public string? CommThreadSubject { get; set; }

    public Guid? CommCallMessageId { get; set; }

    public string? CommCallDirectionCode { get; set; }

    public string? CommCallStatusCode { get; set; }

    public string? CommCallFromNumber { get; set; }

    public string? CommCallToNumber { get; set; }

    public string? CommCallFromDisplayNameSnapshot { get; set; }

    public string? CommCallToDisplayNameSnapshot { get; set; }

    public DateTime? CommCallStartedAt { get; set; }

    public DateTime? CommCallAnsweredAt { get; set; }

    public DateTime? CommCallEndedAt { get; set; }

    public int? CommCallDurationSeconds { get; set; }

    public string? CommCallOutcome { get; set; }

    public string? CommCallAisummary { get; set; }

    public DateTime? CommCallCreatedAt { get; set; }
}
