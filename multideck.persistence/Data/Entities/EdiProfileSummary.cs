using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiProfileSummary
{
    public Guid? EdimpId { get; set; }

    public string? EdimpCode { get; set; }

    public string? EdimpName { get; set; }

    public Guid? EdimpTradingPartnerId { get; set; }

    public string? EditpName { get; set; }

    public Guid? EdimpConnectionId { get; set; }

    public string? EdicName { get; set; }

    public string? EdimpMessageTypeCode { get; set; }

    public string? EdimtName { get; set; }

    public string? EdimpDirectionCode { get; set; }

    public string? EdimpStandardCode { get; set; }

    public string? EdimpStandardVersion { get; set; }

    public bool? EdimpRequiresAcknowledgement { get; set; }

    public bool? EdimpAutoProcessInbound { get; set; }

    public bool? EdimpAutoSendOutbound { get; set; }

    public long? EdimappingProfileCount { get; set; }

    public long? EdiusableMappingVersionCount { get; set; }

    public bool? EdimpIsActive { get; set; }
}
