using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiExceptionQueue
{
    public Guid? EdiviId { get; set; }

    public Guid? EdiviMessageId { get; set; }

    public string? EdimessageDirectionCode { get; set; }

    public string? EdimessageMessageTypeCode { get; set; }

    public string? EdimessageStatusCode { get; set; }

    public Guid? EdimessageTradingPartnerId { get; set; }

    public string? EditpName { get; set; }

    public string? EdiviSeverityCode { get; set; }

    public string? EdivsName { get; set; }

    public string? EdiviIssueCode { get; set; }

    public string? EdiviFieldPath { get; set; }

    public string? EdiviSegmentRef { get; set; }

    public string? EdiviDescription { get; set; }

    public string? EdiviSuggestedFix { get; set; }

    public bool? EdiviIsBlocking { get; set; }

    public string? EdiviStatusCode { get; set; }

    public DateTime? EdiviCreatedAt { get; set; }
}
