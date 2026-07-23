using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommFederationEnvelopeSummary
{
    public Guid? CommFedEnvId { get; set; }

    public Guid? CommFedEnvPeerId { get; set; }

    public string? CommPeerDisplayName { get; set; }

    public string? CommFedEnvDirectionCode { get; set; }

    public string? CommFedEnvStatusCode { get; set; }

    public Guid? CommFedEnvLocalThreadId { get; set; }

    public Guid? CommFedEnvLocalMessageId { get; set; }

    public Guid? CommFedEnvRemoteCompanyId { get; set; }

    public string? CommFedEnvRemoteDatabaseId { get; set; }

    public Guid? CommFedEnvRemoteThreadId { get; set; }

    public Guid? CommFedEnvRemoteMessageId { get; set; }

    public string? CommFedEnvMessageType { get; set; }

    public string? CommFedEnvIdempotencyKey { get; set; }

    public string? CommFedEnvCorrelationId { get; set; }

    public DateTime? CommFedEnvSentAt { get; set; }

    public DateTime? CommFedEnvReceivedAt { get; set; }

    public DateTime? CommFedEnvAcknowledgedAt { get; set; }

    public string? CommFedEnvErrorMessage { get; set; }

    public DateTime? CommFedEnvCreatedAt { get; set; }
}
