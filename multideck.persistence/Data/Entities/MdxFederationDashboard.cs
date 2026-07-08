using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxFederationDashboard
{
    public Guid? MdxagreementId { get; set; }

    public string? MdxagreementCode { get; set; }

    public string? MdxagreementName { get; set; }

    public string? MdxagreementStatusCode { get; set; }

    public string? MdxagreementDirectionCode { get; set; }

    public string? MdxagreementLocalRoleCode { get; set; }

    public string? MdxagreementRemoteRoleCode { get; set; }

    public Guid? CommPeerId { get; set; }

    public string? CommPeerDisplayName { get; set; }

    public string? CommPeerStatusCode { get; set; }

    public string? CommPeerTrustLevelCode { get; set; }

    public int? MdxagreementSharedJobCount { get; set; }

    public int? MdxagreementOpenSharedJobCount { get; set; }

    public DateTime? MdxagreementLastInboundSyncAt { get; set; }

    public DateTime? MdxagreementLastOutboundSyncAt { get; set; }
}
