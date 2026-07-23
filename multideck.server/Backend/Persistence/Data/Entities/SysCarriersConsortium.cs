using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCarriersConsortium
{
    public Guid? RgPk { get; set; }

    public string? RgCode { get; set; }

    public Guid? RgOh { get; set; }

    public DateTime? RgSystemCreateTimeUtc { get; set; }

    public string? RgSystemCreateUser { get; set; }

    public DateTime? RgSystemLastEditTimeUtc { get; set; }

    public string? RgSystemLastEditUser { get; set; }
}
