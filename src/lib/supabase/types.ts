export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      anuncios: {
        Row: {
          created_at: string
          fecha_deteccion: string
          fecha_publicacion: string | null
          fuente_id: string
          id: string
          moneda: Database["public"]["Enums"]["moneda"] | null
          precio: number | null
          propiedad_id: string
          url_original: string
        }
        Insert: {
          created_at?: string
          fecha_deteccion?: string
          fecha_publicacion?: string | null
          fuente_id: string
          id?: string
          moneda?: Database["public"]["Enums"]["moneda"] | null
          precio?: number | null
          propiedad_id: string
          url_original: string
        }
        Update: {
          created_at?: string
          fecha_deteccion?: string
          fecha_publicacion?: string | null
          fuente_id?: string
          id?: string
          moneda?: Database["public"]["Enums"]["moneda"] | null
          precio?: number | null
          propiedad_id?: string
          url_original?: string
        }
        Relationships: [
          {
            foreignKeyName: "anuncios_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_propiedad_id_fkey"
            columns: ["propiedad_id"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anuncios_propiedad_id_fkey"
            columns: ["propiedad_id"]
            isOneToOne: false
            referencedRelation: "vw_oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      edificios_cache: {
        Row: {
          attempts: number
          confidence: number | null
          created_at: string
          id: string
          last_attempt_at: string
          lat: number | null
          lng: number | null
          nombre_norm: string
          nombre_original: string
          source: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          confidence?: number | null
          created_at?: string
          id?: string
          last_attempt_at?: string
          lat?: number | null
          lng?: number | null
          nombre_norm: string
          nombre_original: string
          source: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          confidence?: number | null
          created_at?: string
          id?: string
          last_attempt_at?: string
          lat?: number | null
          lng?: number | null
          nombre_norm?: string
          nombre_original?: string
          source?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fuentes: {
        Row: {
          created_at: string
          descripcion: string | null
          id: string
          logo: string | null
          nombre: string
          url_base: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          id: string
          logo?: string | null
          nombre: string
          url_base: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          id?: string
          logo?: string | null
          nombre?: string
          url_base?: string
        }
        Relationships: []
      }
      ia_extract_cache: {
        Row: {
          created_at: string
          edificio: string | null
          hit_count: number
          input_hash: string
          last_hit_at: string
          model: string
          proyecto: string | null
          zona: string | null
        }
        Insert: {
          created_at?: string
          edificio?: string | null
          hit_count?: number
          input_hash: string
          last_hit_at?: string
          model: string
          proyecto?: string | null
          zona?: string | null
        }
        Update: {
          created_at?: string
          edificio?: string | null
          hit_count?: number
          input_hash?: string
          last_hit_at?: string
          model?: string
          proyecto?: string | null
          zona?: string | null
        }
        Relationships: []
      }
      propiedades: {
        Row: {
          ai_source_flag: string | null
          area_m2: number | null
          banos: number | null
          categoria: Database["public"]["Enums"]["categoria_propiedad"]
          condicion: Database["public"]["Enums"]["condicion_propiedad"] | null
          corregimiento: string | null
          created_at: string
          descripcion: string | null
          direccion: string | null
          distrito: string | null
          estacionamientos: number | null
          estado_anuncio: Database["public"]["Enums"]["estado_anuncio"]
          estado_datos: Database["public"]["Enums"]["estado_datos"]
          fecha_actualizacion: string
          fecha_deteccion: string
          fecha_presunta_venta: string | null
          fecha_publicacion: string | null
          fecha_ultima_revision: string | null
          fecha_ultima_vista: string | null
          fuente_id: string
          habitaciones: number | null
          id: string
          imagenes: string[]
          lat: number
          lng: number
          moneda: Database["public"]["Enums"]["moneda"]
          motivo_estado: string | null
          precio: number
          precio_m2: number | null
          precision_ubicacion: string | null
          presunta_venta: boolean
          provincia: string | null
          resumen_ia_en: string | null
          resumen_ia_es: string | null
          tags_caracteristicas: string[]
          tags_extra: string[]
          tipo_operacion: Database["public"]["Enums"]["tipo_operacion"]
          titulo: string
          ubicacion_fuente: string | null
          url_original: string
          veces_error_consecutivo: number
          veces_no_encontrado: number
        }
        Insert: {
          ai_source_flag?: string | null
          area_m2?: number | null
          banos?: number | null
          categoria: Database["public"]["Enums"]["categoria_propiedad"]
          condicion?: Database["public"]["Enums"]["condicion_propiedad"] | null
          corregimiento?: string | null
          created_at?: string
          descripcion?: string | null
          direccion?: string | null
          distrito?: string | null
          estacionamientos?: number | null
          estado_anuncio?: Database["public"]["Enums"]["estado_anuncio"]
          estado_datos?: Database["public"]["Enums"]["estado_datos"]
          fecha_actualizacion?: string
          fecha_deteccion?: string
          fecha_presunta_venta?: string | null
          fecha_publicacion?: string | null
          fecha_ultima_revision?: string | null
          fecha_ultima_vista?: string | null
          fuente_id: string
          habitaciones?: number | null
          id?: string
          imagenes?: string[]
          lat: number
          lng: number
          moneda?: Database["public"]["Enums"]["moneda"]
          motivo_estado?: string | null
          precio: number
          precio_m2?: number | null
          precision_ubicacion?: string | null
          presunta_venta?: boolean
          provincia?: string | null
          resumen_ia_en?: string | null
          resumen_ia_es?: string | null
          tags_caracteristicas?: string[]
          tags_extra?: string[]
          tipo_operacion: Database["public"]["Enums"]["tipo_operacion"]
          titulo: string
          ubicacion_fuente?: string | null
          url_original: string
          veces_error_consecutivo?: number
          veces_no_encontrado?: number
        }
        Update: {
          ai_source_flag?: string | null
          area_m2?: number | null
          banos?: number | null
          categoria?: Database["public"]["Enums"]["categoria_propiedad"]
          condicion?: Database["public"]["Enums"]["condicion_propiedad"] | null
          corregimiento?: string | null
          created_at?: string
          descripcion?: string | null
          direccion?: string | null
          distrito?: string | null
          estacionamientos?: number | null
          estado_anuncio?: Database["public"]["Enums"]["estado_anuncio"]
          estado_datos?: Database["public"]["Enums"]["estado_datos"]
          fecha_actualizacion?: string
          fecha_deteccion?: string
          fecha_presunta_venta?: string | null
          fecha_publicacion?: string | null
          fecha_ultima_revision?: string | null
          fecha_ultima_vista?: string | null
          fuente_id?: string
          habitaciones?: number | null
          id?: string
          imagenes?: string[]
          lat?: number
          lng?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          motivo_estado?: string | null
          precio?: number
          precio_m2?: number | null
          precision_ubicacion?: string | null
          presunta_venta?: boolean
          provincia?: string | null
          resumen_ia_en?: string | null
          resumen_ia_es?: string | null
          tags_caracteristicas?: string[]
          tags_extra?: string[]
          tipo_operacion?: Database["public"]["Enums"]["tipo_operacion"]
          titulo?: string
          ubicacion_fuente?: string | null
          url_original?: string
          veces_error_consecutivo?: number
          veces_no_encontrado?: number
        }
        Relationships: [
          {
            foreignKeyName: "propiedades_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      propiedades_duplicados: {
        Row: {
          canonica_id: string
          detectado_at: string
          motivo: string
          propiedad_id: string
          score: number
        }
        Insert: {
          canonica_id: string
          detectado_at?: string
          motivo: string
          propiedad_id: string
          score: number
        }
        Update: {
          canonica_id?: string
          detectado_at?: string
          motivo?: string
          propiedad_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "propiedades_duplicados_canonica_id_fkey"
            columns: ["canonica_id"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propiedades_duplicados_canonica_id_fkey"
            columns: ["canonica_id"]
            isOneToOne: false
            referencedRelation: "vw_oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propiedades_duplicados_propiedad_id_fkey"
            columns: ["propiedad_id"]
            isOneToOne: true
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propiedades_duplicados_propiedad_id_fkey"
            columns: ["propiedad_id"]
            isOneToOne: true
            referencedRelation: "vw_oportunidades"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_runs: {
        Row: {
          archived: number
          created_at: string
          errors: number
          finished_at: string | null
          found: number
          fuente_id: string | null
          id: string
          inserted: number
          notes: string | null
          started_at: string
          status: string
          updated: number
        }
        Insert: {
          archived?: number
          created_at?: string
          errors?: number
          finished_at?: string | null
          found?: number
          fuente_id?: string | null
          id?: string
          inserted?: number
          notes?: string | null
          started_at?: string
          status?: string
          updated?: number
        }
        Update: {
          archived?: number
          created_at?: string
          errors?: number
          finished_at?: string | null
          found?: number
          fuente_id?: string | null
          id?: string
          inserted?: number
          notes?: string | null
          started_at?: string
          status?: string
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "scraper_runs_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      urls_fallidas_cache: {
        Row: {
          fuente_id: string
          intentos: number
          motivo: string
          primer_intento_at: string
          ultimo_error: string | null
          ultimo_intento_at: string
          url: string
        }
        Insert: {
          fuente_id: string
          intentos?: number
          motivo: string
          primer_intento_at?: string
          ultimo_error?: string | null
          ultimo_intento_at?: string
          url: string
        }
        Update: {
          fuente_id?: string
          intentos?: number
          motivo?: string
          primer_intento_at?: string
          ultimo_error?: string | null
          ultimo_intento_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_oportunidades: {
        Row: {
          area_m2: number | null
          avg_precio_m2: number | null
          benchmark: number | null
          categoria: Database["public"]["Enums"]["categoria_propiedad"] | null
          condicion: Database["public"]["Enums"]["condicion_propiedad"] | null
          confianza: string | null
          corregimiento: string | null
          descuento_pct: number | null
          distrito: string | null
          estado_anuncio: Database["public"]["Enums"]["estado_anuncio"] | null
          fecha_deteccion: string | null
          fuente_id: string | null
          fuente_nombre: string | null
          id: string | null
          median_precio_m2: number | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          n_comparables: number | null
          opportunity_score: number | null
          otros_anuncios: Json | null
          precio: number | null
          precio_m2: number | null
          provincia: string | null
          tipo_operacion: Database["public"]["Enums"]["tipo_operacion"] | null
          titulo: string | null
          url_original: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propiedades_fuente_id_fkey"
            columns: ["fuente_id"]
            isOneToOne: false
            referencedRelation: "fuentes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_zona_benchmark: {
        Row: {
          avg_precio_m2: number | null
          categoria: Database["public"]["Enums"]["categoria_propiedad"] | null
          corregimiento: string | null
          median_precio_m2: number | null
          n_comparables: number | null
          tipo_operacion: Database["public"]["Enums"]["tipo_operacion"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      ia_extract_cache_touch: { Args: { p_hash: string }; Returns: undefined }
      marcar_url_fallida: {
        Args: {
          p_fuente_id: string
          p_motivo: string
          p_ultimo_error?: string
          p_url: string
        }
        Returns: undefined
      }
    }
    Enums: {
      categoria_propiedad:
        | "apartamento"
        | "casa"
        | "terreno"
        | "local-comercial"
        | "oficina"
        | "galera"
        | "proyecto_nuevo"
      condicion_propiedad: "nueva" | "usada"
      estado_anuncio:
        | "activo"
        | "vendido"
        | "alquilado"
        | "retirado"
        | "posible_inactivo"
        | "archivado"
        | "error_verificacion"
      estado_datos:
        | "completo_verificado"
        | "parcial_verificado"
        | "sin_verificar"
      moneda: "USD" | "PAB"
      tipo_operacion: "venta" | "alquiler"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      categoria_propiedad: [
        "apartamento",
        "casa",
        "terreno",
        "local-comercial",
        "oficina",
        "galera",
        "proyecto_nuevo",
      ],
      condicion_propiedad: ["nueva", "usada"],
      estado_anuncio: [
        "activo",
        "vendido",
        "alquilado",
        "retirado",
        "posible_inactivo",
        "archivado",
        "error_verificacion",
      ],
      estado_datos: [
        "completo_verificado",
        "parcial_verificado",
        "sin_verificar",
      ],
      moneda: ["USD", "PAB"],
      tipo_operacion: ["venta", "alquiler"],
    },
  },
} as const
