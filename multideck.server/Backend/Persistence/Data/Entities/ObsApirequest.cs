using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsApirequest
{
    public Guid ObsapiReqId { get; set; }

    public Guid? ObsapiReqApiclientId { get; set; }

    public Guid? ObsapiReqUserId { get; set; }

    public string ObsapiReqMethod { get; set; } = null!;

    public string ObsapiReqPath { get; set; } = null!;

    public int? ObsapiReqStatusCode { get; set; }

    public int? ObsapiReqDurationMs { get; set; }

    public string? ObsapiReqCorrelationId { get; set; }

    public string? ObsapiReqRemoteIphash { get; set; }

    public string? ObsapiReqUserAgentHash { get; set; }

    public DateTime ObsapiReqRequestAt { get; set; }

    public string? ObsapiReqErrorMessage { get; set; }

    public virtual SecApiclient? ObsapiReqApiclient { get; set; }

    public virtual CmpUser? ObsapiReqUser { get; set; }
}
