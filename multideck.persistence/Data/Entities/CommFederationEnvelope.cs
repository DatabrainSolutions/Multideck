using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommFederationEnvelope
{
    public Guid CommFedEnvId { get; set; }

    public Guid CommFedEnvPeerId { get; set; }

    public string CommFedEnvDirectionCode { get; set; } = null!;

    public string CommFedEnvStatusCode { get; set; } = null!;

    public Guid? CommFedEnvLocalThreadId { get; set; }

    public Guid? CommFedEnvLocalMessageId { get; set; }

    public Guid? CommFedEnvRemoteCompanyId { get; set; }

    public string? CommFedEnvRemoteDatabaseId { get; set; }

    public Guid? CommFedEnvRemoteThreadId { get; set; }

    public Guid? CommFedEnvRemoteMessageId { get; set; }

    public Guid? CommFedEnvRemoteEnvelopeId { get; set; }

    public string CommFedEnvMessageType { get; set; } = null!;

    public string CommFedEnvIdempotencyKey { get; set; } = null!;

    public string? CommFedEnvCorrelationId { get; set; }

    public string CommFedEnvSchemaVersion { get; set; } = null!;

    public string CommFedEnvPayloadJson { get; set; } = null!;

    public string? CommFedEnvPayloadHashSha256 { get; set; }

    public string? CommFedEnvSignature { get; set; }

    public DateTime? CommFedEnvSignedAt { get; set; }

    public DateTime? CommFedEnvSentAt { get; set; }

    public DateTime? CommFedEnvReceivedAt { get; set; }

    public DateTime? CommFedEnvAcknowledgedAt { get; set; }

    public string? CommFedEnvErrorMessage { get; set; }

    public DateTime CommFedEnvCreatedAt { get; set; }

    public DateTime CommFedEnvUpdatedAt { get; set; }

    public virtual SysCommDirection CommFedEnvDirectionCodeNavigation { get; set; } = null!;

    public virtual CommMessage? CommFedEnvLocalMessage { get; set; }

    public virtual CommThread? CommFedEnvLocalThread { get; set; }

    public virtual CommFederationPeer CommFedEnvPeer { get; set; } = null!;

    public virtual SysCommMessageStatus CommFedEnvStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<MdxDataChangeEvent> MdxDataChangeEvents { get; set; } = new List<MdxDataChangeEvent>();

    public virtual ICollection<MdxSharedJobVersion> MdxSharedJobVersions { get; set; } = new List<MdxSharedJobVersion>();
}
