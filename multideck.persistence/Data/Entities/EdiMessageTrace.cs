using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiMessageTrace
{
    public Guid? EdimessageId { get; set; }

    public string? EdimessageStatusCode { get; set; }

    public string? EdimessageAcknowledgementStatusCode { get; set; }

    public string? EdimessageDirectionCode { get; set; }

    public string? EdimessageMessageTypeCode { get; set; }

    public string? EdimessageControlNumber { get; set; }

    public string? EdimessageDocumentReference { get; set; }

    public string? EditpName { get; set; }

    public string? EdicName { get; set; }

    public long? EdieventCount { get; set; }

    public DateTime? EdilastEventAt { get; set; }

    public long? EdiopenIssueCount { get; set; }

    public long? EdiacknowledgementCount { get; set; }
}
