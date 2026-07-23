using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiCodeMapping
{
    public Guid EdicodeMapId { get; set; }

    public Guid? EdicodeMapMappingProfileId { get; set; }

    public Guid? EdicodeMapTradingPartnerId { get; set; }

    public string EdicodeMapCodeSet { get; set; } = null!;

    public string EdicodeMapExternalCode { get; set; } = null!;

    public string? EdicodeMapExternalLabel { get; set; }

    public string? EdicodeMapInternalTable { get; set; }

    public string? EdicodeMapInternalCode { get; set; }

    public Guid? EdicodeMapInternalId { get; set; }

    public string EdicodeMapDirectionCode { get; set; } = null!;

    public bool EdicodeMapIsActive { get; set; }

    public DateTime EdicodeMapCreatedAt { get; set; }

    public virtual SysEdidirection EdicodeMapDirectionCodeNavigation { get; set; } = null!;

    public virtual EdiMappingProfile? EdicodeMapMappingProfile { get; set; }

    public virtual EdiTradingPartner? EdicodeMapTradingPartner { get; set; }
}
