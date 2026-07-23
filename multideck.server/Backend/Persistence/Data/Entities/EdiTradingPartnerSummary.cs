using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiTradingPartnerSummary
{
    public Guid? EditpId { get; set; }

    public string? EditpCode { get; set; }

    public string? EditpName { get; set; }

    public Guid? EditpOrgId { get; set; }

    public string? OrgName { get; set; }

    public string? EditpStatusCode { get; set; }

    public string? EditpDefaultStandardCode { get; set; }

    public string? EditpDefaultTransportMethodCode { get; set; }

    public bool? EditpRequiresCertification { get; set; }

    public long? EdiconnectionCount { get; set; }

    public long? EdimessageProfileCount { get; set; }

    public long? EdiopenCertificationCount { get; set; }

    public bool? EditpIsActive { get; set; }
}
