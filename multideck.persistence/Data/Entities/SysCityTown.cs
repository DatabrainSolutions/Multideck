using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCityTown
{
    public Guid? R9Pk { get; set; }

    public string? R9InternationalName { get; set; }

    public bool? R9IsActive { get; set; }

    public bool? R9IsSystem { get; set; }

    public string? R9LocalLanguageName { get; set; }

    public string? R9RwNkstate { get; set; }

    public string? R9RnNkcountry { get; set; }

    public Guid? R9R3TimeZone { get; set; }

    public short? R9AutoVersion { get; set; }

    public DateTime? R9SystemCreateTimeUtc { get; set; }

    public string? R9SystemCreateUser { get; set; }

    public DateTime? R9SystemLastEditTimeUtc { get; set; }

    public string? R9SystemLastEditUser { get; set; }
}
