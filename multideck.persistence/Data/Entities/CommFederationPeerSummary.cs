using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommFederationPeerSummary
{
    public Guid? CommPeerId { get; set; }

    public Guid? CommPeerRemoteCompanyId { get; set; }

    public string? CommPeerRemoteDatabaseId { get; set; }

    public string? CommPeerDisplayName { get; set; }

    public string? CommPeerTradingName { get; set; }

    public string? CommPeerCountryCode { get; set; }

    public string? CommPeerNetworkAddress { get; set; }

    public string? CommPeerStatusCode { get; set; }

    public string? CommPeerTrustLevelCode { get; set; }

    public Guid? CommPeerLocalOrgId { get; set; }

    public string? CommPeerLocalOrgName { get; set; }

    public DateTime? CommPeerLastHandshakeAt { get; set; }

    public DateTime? CommPeerLastMessageAt { get; set; }

    public int? CommPeerEnvelopeCount { get; set; }

    public int? CommPeerActiveSubscriptionCount { get; set; }
}
