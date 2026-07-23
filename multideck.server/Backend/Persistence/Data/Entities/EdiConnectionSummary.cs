using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiConnectionSummary
{
    public Guid? EdicId { get; set; }

    public string? EdicName { get; set; }

    public Guid? EdicTradingPartnerId { get; set; }

    public string? EditpName { get; set; }

    public Guid? EdicServiceProviderId { get; set; }

    public string? EdispName { get; set; }

    public string? EdicTransportMethodCode { get; set; }

    public string? EditmName { get; set; }

    public string? EdicStatusCode { get; set; }

    public string? EdicDirectionCode { get; set; }

    public Guid? EdicOrgOfficeId { get; set; }

    public string? OfficeName { get; set; }

    public string? EdicEnvironment { get; set; }

    public DateTime? EdicLastTestAt { get; set; }

    public DateTime? EdicLastSuccessAt { get; set; }

    public string? EdicLastErrorText { get; set; }

    public long? EdiprofileCount { get; set; }

    public long? EdiopenMessageCount { get; set; }
}
