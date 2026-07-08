using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiAcknowledgementQueue
{
    public Guid? EdimessageId { get; set; }

    public string? EdimessageMessageTypeCode { get; set; }

    public Guid? EdimessageTradingPartnerId { get; set; }

    public string? EditpName { get; set; }

    public string? EdimessageControlNumber { get; set; }

    public string? EdimessageDocumentReference { get; set; }

    public string? EdimessageAcknowledgementStatusCode { get; set; }

    public DateTime? EdimessageAckDueAt { get; set; }

    public DateTime? EdimessageSentAt { get; set; }

    public long? EdiacknowledgementCount { get; set; }
}
