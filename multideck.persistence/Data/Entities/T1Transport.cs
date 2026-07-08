using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Transport
{
    public Guid T1trId { get; set; }

    public Guid T1trT1id { get; set; }

    public string T1trTransportStage { get; set; } = null!;

    public string? T1trModeOfTransport { get; set; }

    public string? T1trIdentity { get; set; }

    public string? T1trNationalityCodeSnapshot { get; set; }

    public string? T1trConveyanceReference { get; set; }

    public string T1trTransportJson { get; set; } = null!;

    public DateTime T1trCreatedAt { get; set; }

    public virtual SysCustomsTransportMode? T1trModeOfTransportNavigation { get; set; }

    public virtual T1Declaration T1trT1 { get; set; } = null!;
}
