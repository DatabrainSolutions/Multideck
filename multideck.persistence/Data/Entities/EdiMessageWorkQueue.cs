using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiMessageWorkQueue
{
    public Guid? EdimessageId { get; set; }

    public string? EdimessageStatusCode { get; set; }

    public string? EdimessageAcknowledgementStatusCode { get; set; }

    public string? EdimessageDirectionCode { get; set; }

    public string? EdimessageMessageTypeCode { get; set; }

    public string? EdimtName { get; set; }

    public string? EdimessageStandardCode { get; set; }

    public Guid? EdimessageTradingPartnerId { get; set; }

    public string? EditpName { get; set; }

    public Guid? EdimessageConnectionId { get; set; }

    public string? EdicName { get; set; }

    public Guid? EdimessageJobId { get; set; }

    public int? JobNumber { get; set; }

    public string? EdimessageDocumentReference { get; set; }

    public string? EdimessageControlNumber { get; set; }

    public DateTime? EdimessageReceivedAt { get; set; }

    public DateTime? EdimessageSentAt { get; set; }

    public DateTime? EdimessageAckDueAt { get; set; }

    public int? EdimessageRetryCount { get; set; }

    public string? EdimessageLastErrorText { get; set; }

    public DateTime? EdimessageCreatedAt { get; set; }
}
